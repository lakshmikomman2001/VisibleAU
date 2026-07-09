# VisibleAU — Control Plane LLD: App-Level Configuration, Secrets & Operator Admin

**Version:** 1.6 (v1.0 + SIX conflict-audit passes vs Phase 1 + Phase 2 canon — CP-1..29, see §0)
**Date:** 5 July 2026
**Owner:** Sri
**Scope:** a **separate operator-only database** and a **separate admin web app** to author app-level configuration (region/market configs, per-region feature enablement, app settings) and manage **encrypted secrets** — accessible only to Sri + VisibleAU technical support, **never clients**.
**Canon grounding:** Phase 2 LLD v8.70 + prototype FIX17; Phase 1 foundations. Verified facts used below are cited inline.

---

## 0. Conflict-check log (multi-angle audit vs v8.70)

Audited from four angles. **Verified clean:** `org_feature_flags` schema (id, organization_id, flag_key, is_enabled, reason, set_by, expires_at, UNIQUE(organization_id, flag_key), RLS enabled, 8 operator-only keys); `config_bundle_cache` + `ConfigBundleService.activate/resolve`; `config:validate` CLI exists; `ga4_api_secret` plaintext (Sprint 9); managed-SaaS/no-BYOK; Better Auth canonical; region→`market_code` model; `provider_market_capabilities`. **Conflicts found & resolved:**

**Pass 1 — structural**
- **CP-1 — missing `bundle_version` + `config_digest` (fixed).** `config_bundle_cache` has `bundle_version INTEGER` + `config_digest TEXT`, UNIQUE(market_code, locale, segment, **bundle_version**). The publish must **increment `bundle_version` and compute `config_digest`** — my publish flow/`config_publications` omitted them. Added (§6).

**Pass 2 — semantic / integration**
- **CP-2 — publish must honour the activate transaction (MAJOR, fixed).** `config_bundle_one_active` is a partial unique index; `ConfigBundleService.activate(newId)` owns a transaction that **inserts the new `is_active=true` row AND deactivates the old one atomically**. An external writer that only inserts a new active row **violates the index / creates duplicate actives**. **Resolved:** the **internal-API transport is the correct one** (it invokes the tenant's `ConfigBundleService.activate`, which owns the transaction) — not merely "preferred for isolation." The **direct-DB-role option is unsafe unless it fully replicates activate()** (insert + deactivate + version + digest in one tx); downgraded accordingly (§6, §9).
- **CP-3 — "tenant app unchanged" is imprecise (fixed).** The config **read** (`ConfigBundleService.resolve`) is unchanged, but the feature-flag **evaluation** (`lib/feature-flags/index.ts`, which has canonical priority **DB flags > env vars > defaults**) **must change** to add the Level-1 platform-availability check. **Resolved:** claim corrected — read path unchanged, evaluation gains a Level-1 gate (a real code change). Also: `platform_feature_availability.feature_key` **aligns with `org_feature_flags.flag_key`** where they overlap (`fan_out`, `linkedin_audit`, `youtube_audit`) so the two-level check is coherent (§7, §12).

**Pass 3 — downstream / mechanics**
- **CP-4 — tenant-side audit event + UPSERT (fixed).** Setting `org_feature_flags` from the control plane must (a) **UPSERT** `ON CONFLICT(organization_id, flag_key)` setting `set_by`/`reason`/`updated_at`, and (b) **emit the tenant-side `feature_flag_changed` `audit_trail` event** (table 35) — not only log to `platform_audit_log`, or the tenant audit trail is incomplete. Added to the publish path (§6).
- **CP-5 — RLS on cross-org flag writes (fixed).** `org_feature_flags` has RLS (org-scoped, WITH CHECK on `organization_id`); operator writes aren't in a tenant session context and would be **blocked by RLS**. **Resolved:** the write path runs via the internal API with an **elevated/service context** (or a role that bypasses RLS for this operator write) — specified (§6, §9).

**Pass 4 — security (this system holds secrets)**
- **CP-6 — honest secret threat model (fixed).** Env-injection means the provider keys **still live in the tenant runtime** (they must, to call LLM APIs) — the control plane does **not** remove runtime exposure. **Resolved:** the benefit is **lifecycle** (rotation, audit, single source of truth, ending config/plaintext sprawl), not reduced runtime exposure — stated plainly (§5).
- **CP-7 — secret-fetch availability coupling (fixed).** A cached runtime fetch puts the control plane on the **audit hot path** (control plane down → audits fail) and adds attack surface. **Resolved:** **env-injection for audit-critical provider keys** (audits never depend on the control plane being up); reserve mTLS+cached fetch for **non-critical rotatable** secrets, with graceful degradation (§5).
- **CP-8 — cross-DB write coupling (fixed).** A direct control-plane→tenant-DB write connection is a security concern (a write path into production tenant data). **Resolved:** the internal-API transport (tenant app validates + strictly limits writes to `config_bundle_cache`/`org_feature_flags`) is safer and now the recommendation (§6, §9; ties to CP-2).
- **CP-9 — audit immutability at the grant level (fixed).** `platform_audit_log` append-only must be enforced by **DB grants** (the app role lacks UPDATE/DELETE on it), not app convention (§9).

**Standing caveat:** grounded in v8.70 as written; confirm the `ConfigBundleService.activate` signature, the `feature_flag_changed` emission path, and the `lib/feature-flags` priority logic against the **built repo** before implementation.

### Second audit — config lifecycle / source-of-truth / operations (a different angle)

The first four passes checked seam mechanics + security; this pass checks the **systemic** questions — ownership, drift, caching, environments, cutover. Six conflicts found & resolved:

- **CP-10 — dual-writer on `config_bundle_cache` (MAJOR, fixed).** The **tenant app's Sprint 1 seed already writes `config_bundle_cache`** (it's in the seed ordering; `audits.config_bundle_id` FKs it). Once the control plane also publishes there, a deploy-time re-seed could **overwrite control-plane config**. **Resolved:** post-cutover, `config_bundle_cache` is a **published artifact owned solely by the control plane** — the tenant seed only writes a **bootstrap default when the table is empty** and is otherwise a **no-op in control-plane-owned environments**; `config_bundle_cache` is **never hand-edited** (source of truth = the control-plane `platform_*` tables) (§4, §6, §13).
- **CP-11 — config-cache invalidation (fixed).** No in-memory cache is visible in `ConfigBundleService.resolve` (the "cache" is the table), **but** if the tenant app/edge caches the resolved config (Next.js data cache, `react.cache`, per-request memo), a publish **won't take effect until TTL**. **Resolved:** the publish must **invalidate the tenant config cache** (e.g. `revalidateTag('config:<market>')`) as part of the internal-API publish, or config reads must use a short bounded TTL — **verify against the built app** (§6).
- **CP-12 — environments (fixed).** There are **two tenant DBs** (dev/mock `visibleau` + prod/real `visibleau_prod`; LLM_MODE=mock vs real). The LLD didn't say **which** the control plane publishes to. **Resolved:** the control plane is **environment-aware** — it targets a chosen tenant environment, allows **env-specific config** (dev may differ from prod), and is **never a test dependency** (tenant tests seed `config_bundle_cache` directly via fixtures, not via the control plane) (§6, §11).
- **CP-13 — publish atomicity (fixed).** A publish touches `config_bundle_cache` (activate) + `org_feature_flags` (UPSERT) + `audit_trail` (event) — all in the tenant DB. If done as separate writes, a partial failure leaves **inconsistent state**. **Resolved:** the internal-API publish wraps all three in **one tenant-DB transaction** (atomic; rolls back together) (§6).
- **CP-14 — rollback mechanics (clarified).** `bundle_version` is unique + monotonic, so "re-activate a prior payload" was ambiguous. **Resolved:** rollback = **re-activate the prior `bundle_version` row via `activate()`** (which performs the one-active flip: set the old row `is_active=true`, deactivate the current) — a clean pointer move, not a content mutation; `config_publications` records the change (§6).
- **CP-15 — bootstrap / cutover (fixed).** Moving from today's state (tenant seed owns config; flags set manually) to control-plane ownership needs a defined cutover. **Resolved:** **import** the current `config_bundle_cache` + `org_feature_flags` into the control-plane `platform_*` source tables as the baseline, **then** flip ownership (tenant seed → bootstrap-only per CP-10; manual flag edits stop). Sequenced in §13 (§13).

**Second-audit standing note:** CP-10/CP-11/CP-12 depend on how the **built** tenant app seeds config and caches reads — confirm both against the repo (`db/seed`, any `revalidateTag`/cache on the config path) before implementation.

### Third audit — resilience / key lifecycle / operational integrity (a different angle again)

The prior passes covered seam mechanics, secret encryption, and config lifecycle; this pass covers **what happens when things fail or scale** — key loss, concurrency, the new attack surface, cutover safety, drift, compliance. Six conflicts found & resolved:

- **CP-16 — master-key loss = permanent secret loss (CRITICAL, fixed).** With envelope encryption, **losing the KMS master key makes every secret unrecoverable forever** — and the canon has **no DR/backup guidance** to lean on. **Resolved:** (a) the master key uses **KMS-native durability/backup** (multi-region key or key backup/escrow) — never a single unbacked key; (b) an **out-of-band secret source-of-truth** (the original keys are re-enterable from provider dashboards) so a total loss is recoverable by re-entry, not catastrophic; (c) the control-plane DB has **encrypted backups**; (d) a short **DR runbook**. Note the blast radius is bounded: **the tenant app survives a control-plane outage** (config already lives in `config_bundle_cache`; provider keys are env-injected) — only the *authoring source* + secrets need DR (§5, §9).
- **CP-17 — `bundle_version` race under concurrent publishes (fixed).** Two operators publishing the same (market, locale, segment) both compute `next = max+1` → **UNIQUE(market_code, locale, segment, bundle_version) violation or a lost update**. **Resolved:** serialize per-tuple with a **pg advisory lock** around the publish, **or** retry-on-unique-violation (aligns with the canon's idempotency-via-unique-constraint convention). Same guard for concurrent secret rotation (§6).
- **CP-18 — the internal publish API is a poison-all-tenants attack surface (fixed).** `/api/internal/config/publish` is a **write path into every tenant's config** on the *production tenant app* — compromise could disable a feature for all tenants or inject config. CP-8 covered the connection; this covers the **endpoint**. **Resolved:** defense-in-depth — **signed requests** (align to the existing `webhook_endpoints.signingSecret` pattern) + a **rotating service token** + **IP allowlist** + **strict schema validation of the published `resolved_config`** (reject unknown keys / malformed payloads so it can't inject behaviour) + rate limiting + **audit every call** + refuse if the caller isn't the control plane (§6, §9).
- **CP-19 — feature-availability default OFF disables everything on cutover (fixed).** Evaluation is `resolved_config.feature_availability[key]?.is_available` — **falsy when the row is absent** — and OQ4 recommends a **closed/opt-in** default. So on cutover, any **currently-live feature without a seeded availability row silently turns OFF**. **Resolved:** the cutover import (CP-15) **must enumerate all currently-live features and seed `is_available=true`** for the active market(s), and cutover is **gated on a completeness check** (every feature in use has an availability row). The absent-row default is documented as **closed** (§7, §13).
- **CP-20 — master-key rotation not addressed (fixed).** The LLD covered *secret* rotation but not **KMS master-key** rotation, which must **re-wrap every secret's `wrapped_dek`** (envelope re-encryption) with no plaintext re-exposure. **Resolved:** master-key rotation re-wraps all DEKs, versioned, logged (§5).
- **CP-21 — drift detection + audit retention/compliance (fixed).** (a) Nothing detects **drift** between the source (`platform_*`) and the published `config_bundle_cache` if a publish partially failed (pre-CP-13) or config was hand-edited. **Resolved:** a reconciliation check compares the published `config_digest` to a recomputed digest of the source, alerting/re-publishing on mismatch. (b) `platform_audit_log` is append-only → **grows forever and holds operator PII** (actor/IP). **Resolved:** an **archive-not-delete** retention approach (cold-store old entries, preserving audit integrity) and operator-PII handling under the **AU Privacy Act** (§6, §9).

**Third-audit standing note:** CP-16/CP-20 depend on the chosen KMS's backup + rotation primitives; CP-18 on the tenant app's existing request-signing (`signingSecret`) — align to those when implementing.

### Fourth audit — dimensional completeness + practical implementation (a different angle)

Prior passes covered mechanics, security, lifecycle, and resilience; this pass checks the **config key dimensions** and **how the separate admin app is actually built**. Three real conflicts found & resolved:

- **CP-22 — the `segment` (and `locale`) dimension was dropped (structural, fixed).** `config_bundle_cache` is keyed by **`(market_code, locale, segment, bundle_version)`** with `segment ∈ {smb, agency, enterprise}`, and `ConfigBundleService.resolve(market, locale, segment)` resolves per tuple. My publish flow + `config_publications` treated config as **per-market only** — so a market has *multiple* bundles (one per segment × locale) that I collapsed into one. **Resolved:** the publish targets the full **`(market_code, locale, segment)`** tuple; `config_publications` records all three; the admin app authors config **per segment** where it differs (and a "same across segments" convenience that fans out) (§4, §6).
- **CP-23 — the admin app can't "reuse FIX17 tokens" without a sharing mechanism (fixed).** §8 said reuse the FIX17 design language, but the admin app is a **separate Next.js app** and the tenant app's tokens/components are **not in a shared package** (no monorepo/shared-UI package in canon). **Resolved:** either extract the design tokens (+ a few primitives) into a **shared workspace package** consumed by both apps, or accept a **documented lightweight token duplication** for the admin app (it needs token *values* + basic primitives, not the full component library) — pick one explicitly; don't assume cross-app import works (§8).
- **CP-24 — `min_tier` must use the canonical 7-tier enum + `tierRank` (fixed).** There are **7 tiers** — Sample / Free / Starter / Growth / Agency / **Agency Pro** / Enterprise — with a canonical `tierRank` map and Phase-1 `TIER_*` constants (Phase 2 "defers to Phase 1 TIER_* constants"). My `min_tier` used an ad-hoc subset/casing (`'growth'`). **Resolved:** `min_tier` is **validated against the canonical tier enum and compared via `tierRank`** (never an invented subset or wrong casing); the platform tier-floor is a floor over the same `subscriptions.tier` values the tenant app uses (§7, §13).

**Fourth-audit standing note:** CP-22 (segment/locale fan-out) and CP-24 (the exact `TIER_*` constants + `tierRank`) should be confirmed against the built `ConfigBundleService.resolve` signature and the Phase-1 tier constants in the repo.

### Fifth audit — config composition completeness (a different angle)

This pass checks what the published `resolved_config` actually *is*. **Key finding: v8.70 does not specify `resolved_config`'s internal structure or how `config_digest` is computed** — that lives in the built code, not the LLD. Two conflicts found & resolved:

- **CP-25 — publish must MERGE `resolved_config`, not replace it; and the write-scope is inconsistent (fixed).**
  - **(a) Merge, don't clobber.** `resolved_config` is an existing JSONB blob whose full contents aren't documented (it may carry market/segment settings, thresholds, etc. beyond feature availability). If the control plane **replaces** it with only `feature_availability`, it **wipes whatever else is in there**. **Resolved:** the publish **reads the current `resolved_config`, merges in `feature_availability` (and the control-plane-owned keys), and re-activates** — never replaces wholesale; the exact structure is **confirmed against the repo** before first publish.
  - **(b) Write-scope reconciliation.** CP-8 limited the publish write-scope to `config_bundle_cache` + `org_feature_flags`, but CP-15 says enabling a new market must seed the **market-keyed source tables** (`provider_market_capabilities`, `sampling_policies`, `market_ai_budget_policies`, `metric_quality_gates`, `prompt_pack_coverage`) — a *bigger* scope. **Resolved:** pick the boundary explicitly — **either** those source tables are **tenant-app/migration-owned** and the control plane only *triggers/coordinates* market activation (keeping the tight 2-table write-scope), **or** the control plane owns them too and the write-scope is **documented to include them**. Recommended: **tenant-migration-owned source tables + control-plane-triggered activation** (smallest privileged write path) (§6, §9).
- **CP-26 — `config_digest` must be computed identically to the tenant app (fixed).** `config_digest` gates the CP-21 drift check and de-dups bundles, but its algorithm/canonicalization isn't in the LLD. **Resolved:** the control plane computes `config_digest` with the **same method as the tenant app** (same canonical JSON + hash) — reuse the tenant's digest function via the internal publish API rather than re-implementing, so digests always match (§6).

**Fifth-audit standing note:** CP-25/CP-26 are the clearest evidence yet that the remaining risk is in the **code, not the doc** — `resolved_config`'s structure and the digest function are only knowable from the repo. Confirm both before implementing the publish; prefer **reusing the tenant app's own compose+digest logic** (via the internal API) over duplicating it.

### Sixth audit — Phase-1-grounded (secret inventory, dead config, operator-auth isolation)

Prior passes audited mostly against Phase 2; this pass grounds against **Phase 1** artifacts specifically. Three conflicts found & resolved:

- **CP-27 — the secret inventory was incomplete, and it needs a classification (fixed).** The canon's real env-secret surface is far larger than my four examples: **`ABN_LOOKUP_GUID`** (the government ABR credential — VisibleAU-specific and irreplaceable-by-provider-dashboard in the CP-16 sense: it's re-obtainable but via a government process), `GOOGLE_AI_API_KEY`/`GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_PLACES_API_KEY` (=`GMB_API_KEY`), `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY`, plus Stripe (secret + webhook secret), Resend, Supabase storage keys, `BETTER_AUTH_SECRET`, `DATABASE_URL`s. **Resolved:** (a) §5 now carries the **full inventory**; (b) a **two-class model**: *managed secrets* (provider/integration keys — inventoried, encrypted, rotated via the control plane) vs **boot-critical infrastructure secrets** (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `INNGEST_SIGNING_KEY`/`EVENT_KEY`) which **must stay in the deployment secret store** — the app needs them *before* any control-plane sync could run; the control plane may **inventory** them (masked metadata, rotation reminders) but is never on their supply path (§5).
- **CP-28 — dead-config class: `maintenance_mode` has no consumer (fixed).** My `platform_settings` example included `maintenance_mode` — **zero occurrences in the entire canon**; no tenant-side consumer exists. Publishing a key nothing reads is dead config that *looks* like a working control. **Resolved:** a binding rule — **every `platform_settings` key must name its tenant-side consumer** (the code path that reads it) in its `description`, and `config:validate` rejects keys without one; `maintenance_mode` is removed from the examples until a consumer is built (§4).
- **CP-29 — two Better Auth instances need explicit cookie/session isolation (fixed).** The operator app is a **second** Better Auth instance, and the canon has no cookie-domain guidance. If admin + tenant apps share an apex (e.g. `app.` / `admin.` on one domain) with apex-scoped cookies, sessions could bleed across auth realms. **Resolved:** the operator app uses a **separate `BETTER_AUTH_SECRET`**, **host-only cookies** (never apex/parent-domain-scoped), and ideally a **separate apex domain** for the admin app; the two auth realms share nothing (no common user table, no shared cookie scope) (§8, §9).

**Sixth-audit standing note:** CP-27's inventory should be completed against the repo's actual `.env` surface (env vars accrete in code faster than in docs).

---

## 1. Goal & the plane separation

Split VisibleAU into two planes:
- **Data plane** (existing) — the tenant application + tenant database: customer orgs, brands, audits, RLS, billing. What customers use.
- **Control plane** (NEW, this LLD) — an operator-only system (separate DB + separate admin web app) that **authors app-level configuration and holds secrets**, and **publishes** that config into the data plane's existing mechanisms. What only Sri + support use.

This is the standard control-plane/data-plane split, and it maps onto what the canon already half-does (a market-keyed config layer) — the control plane becomes the **governed authoring surface** for it, plus the home for things that must never sit in the tenant DB (secrets, operator-only settings, per-region feature policy).

## 2. Grounding — what exists vs what's missing

**Already in the canon (data plane):**
- `config_bundle_cache` — market-keyed runtime config: `market_code`/`locale`/`segment` + `resolved_config` JSONB, one active per tuple (`config_bundle_one_active` partial unique index), activated transactionally by `ConfigBundleService.activate()`. **This is how the tenant app reads config at runtime — unchanged by this LLD.**
- `org_feature_flags` — **already operator-only, per-org** feature toggles. 8 canonical `flag_key`s (`free_tier_enabled`, `growth_tier_early_access`, `agency_tier_early_access`, `fan_out_enabled`, `linkedin_audit_enabled`, `youtube_audit_enabled`, `evidence_archive_enabled`, `google_ai_mode_enabled`), each `set_by='ops'|'sri'`, "Never set via user-facing API," with `reason`/`expires_at`; RLS enabled; `feature_flag_changed` audit event exists.
- `provider_market_capabilities` — per-market LLM provider enablement (`is_enabled`), `ProviderCapabilityRegistry.getEnabledProviders()`.
- **Secrets = env vars.** "Managed SaaS… BYOK model → NOT a gap" — so the secrets are **VisibleAU's own** keys (LLM providers, `YOUTUBE_API_KEY`, Stripe, etc.), not per-customer. One weak spot: `organizations.ga4_measurement_id + ga4_api_secret` are stored **plaintext TEXT in the tenant DB** (Sprint 9) — a candidate for the encrypted store.
- **Auth = Better Auth** (canonical; Clerk is stale). Region model: `organizations.region` (`au|nz|uk`) → `toMarketCode` → `market_code` (`AU_EN|NZ_EN|UK_EN`); only `AU_EN` active (NZ/UK Phase 3).

**Missing (what this LLD adds):**
1. A **UI/admin app** to manage operator config — today `org_feature_flags` and config are set manually (DB/scripts), which doesn't scale and is error-prone.
2. A **per-region/market app-level feature layer** — the existing flags are per-*org*; there's no "ABN lookup is available in AU but not elsewhere," "Shopify ads only in region X" **platform** policy.
3. A **separate operator-only database** — config/flags currently live in the tenant DB.
4. **Encrypted secret management** with rotation — upgrade from env-var sprawl + the plaintext `ga4_api_secret`.
5. An **operator access model** (Sri vs support RBAC) with its own auth + immutable audit log.

## 3. Architecture

```
┌───────────────────────── CONTROL PLANE (operator-only, NEW) ─────────────────────────┐
│  Admin Web App (separate Next.js 16 app)          Control-Plane DB (separate Postgres) │
│  • Better Auth (operators) + MFA + RBAC           • platform_regions / platform_markets │
│  • Region/market config UI                        • platform_feature_availability        │
│  • Feature-availability UI (per region)           • platform_settings                    │
│  • Secrets UI (masked, decrypt-logged)            • platform_secrets (AES-256-GCM)        │
│  • Publish / activate flow                        • operator auth tables (Better Auth)    │
│  • Audit-log viewer                               • platform_audit_log (immutable)        │
│                                                   • config_publications (versioned)       │
│  Network-isolated (VPN / private / IP allowlist). Master key in KMS. No public access.   │
└──────────────────────────────────────┬────────────────────────────────────────────────┘
                                        │  governed PUBLISH  (internal authenticated API,
                                        │  or dedicated restricted DB role)
                                        ▼
┌───────────────────────── DATA PLANE (existing tenant app) ──────────────────────────────┐
│  writes resolved config → config_bundle_cache (via ConfigBundleService.activate)          │
│  sets operator flags     → org_feature_flags                                              │
│  Tenant app READS config unchanged (ConfigBundleService.resolve + org_feature_flags).     │
│  Secrets: injected into the tenant runtime env / fetched via cached secure API.           │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

**Principle:** the control plane **authors and publishes**; the data plane **consumes unchanged**. No customer-facing behaviour changes; the tenant app keeps reading `config_bundle_cache` + `org_feature_flags` exactly as today (its config *read* is unchanged; its feature *evaluation* gains one Level-1 check — CP-3). **Source of truth = the control-plane `platform_*` tables; `config_bundle_cache` is a published artifact — never hand-edited, and the tenant seed writes it only as an empty-table bootstrap** (CP-10).

## 4. Control-plane database (separate Postgres, operator-only)

A distinct database instance (a *third* DB alongside the existing dev/mock and prod/real tenant DBs), **not publicly reachable**, no tenant data. Drizzle schema. No RLS needed (it's single-tenant = VisibleAU itself), but strict **operator RBAC at the app layer** + row-level `created_by`/`updated_by` provenance.

```sql
-- Regions & markets the platform operates (mirrors the region→market model, operator-owned)
CREATE TABLE platform_markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code TEXT NOT NULL UNIQUE,        -- 'AU_EN' | 'NZ_EN' | 'UK_EN' | ...
  region TEXT NOT NULL,                     -- 'au' | 'nz' | 'uk'
  locale TEXT NOT NULL,                     -- 'en-AU' ...
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false, -- activating a market = publishing it live (Phase-3 gate)
  currency TEXT, fx_rate NUMERIC,           -- per-market money (feeds cost conversion)
  settings JSONB NOT NULL DEFAULT '{}',     -- market-specific operational settings
  created_by TEXT, updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-region/market APP-LEVEL feature availability (NEW layer — above per-org flags)
CREATE TABLE platform_feature_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL,                -- 'abn_lookup' | 'shopify_ads' | 'fan_out' | 'presence_lenses' | 'linkedin_audit' | ...
  market_code TEXT NOT NULL REFERENCES platform_markets(market_code),
  is_available BOOLEAN NOT NULL DEFAULT false,
  min_tier TEXT,                            -- optional platform tier floor; CP-24: MUST be a canonical tier (Sample/Free/Starter/Growth/Agency/Agency Pro/Enterprise per Phase-1 TIER_* constants), compared via tierRank; still gated by subscriptions.tier downstream
  config JSONB NOT NULL DEFAULT '{}',       -- feature-specific settings for this market
  updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(feature_key, market_code)
);

-- Global app settings (operator-tunable, non-secret)
CREATE TABLE platform_settings (
  key TEXT PRIMARY KEY,                      -- e.g. 'default_runs_per_prompt' — CP-28: every key MUST name its tenant-side consumer in description (config:validate rejects consumer-less keys; no dead config)
  value JSONB NOT NULL,
  description TEXT, updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Encrypted secrets (VisibleAU's own keys) — see §5
CREATE TABLE platform_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,                  -- CP-27 managed inventory: openai/anthropic/google_ai/perplexity keys, ABN_LOOKUP_GUID, GOOGLE_PLACES_API_KEY, youtube, stripe secret + webhook secret, resend, supabase storage. (Boot-critical infra — DATABASE_URL, BETTER_AUTH_SECRET, INNGEST_SIGNING/EVENT_KEY — stays in the deployment store; inventoried here as masked metadata only.)
  scope TEXT NOT NULL DEFAULT 'global',      -- 'global' | market_code (if a key is market-specific)
  ciphertext BYTEA NOT NULL,                 -- AES-256-GCM
  iv BYTEA NOT NULL,                         -- unique per value
  auth_tag BYTEA NOT NULL,                   -- GCM tag
  wrapped_dek BYTEA NOT NULL,                -- data-encryption key, wrapped by KMS (envelope encryption)
  version INTEGER NOT NULL DEFAULT 1,        -- for rotation
  last_rotated_at TIMESTAMPTZ,
  created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutable audit log (every change + every secret access)
CREATE TABLE platform_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL,                       -- operator identity (Better Auth user)
  action TEXT NOT NULL,                      -- 'feature_availability.update' | 'secret.decrypt' | 'config.publish' | ...
  target TEXT,                               -- what was touched
  before JSONB, after JSONB,                 -- diff (secrets: never store plaintext, only key + version)
  ip TEXT, user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);  -- append-only; no UPDATE/DELETE grants

-- Record of what was published to the data plane (versioned, rollback-able)
CREATE TABLE config_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code TEXT NOT NULL,
  locale TEXT NOT NULL,                      -- CP-22: config_bundle_cache key is (market_code, locale, segment)
  segment TEXT NOT NULL,                     -- 'smb' | 'agency' | 'enterprise'
  resolved_config JSONB NOT NULL,            -- the exact payload written to tenant config_bundle_cache
  published_by TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_bundle_id UUID,                     -- the config_bundle_cache row it activated
  status TEXT NOT NULL DEFAULT 'active'      -- 'active' | 'superseded' | 'rolled_back'
);
```

## 5. Secrets management (strong encryption, key outside the DB)

- **Algorithm:** **AES-256-GCM**, unique IV/nonce per value, GCM auth tag stored — authenticated encryption (tamper-evident; identical secrets ≠ identical ciphertext).
- **Envelope encryption:** each secret encrypted with a data-encryption key (DEK); the DEK is **wrapped by a master key in a KMS/secrets manager** (AWS KMS / GCP Secret Manager / Azure Key Vault / Vault). **The master key never lives in the control-plane DB or any config file.** (Early-stage pragmatic fallback: master key as an injected env var in the isolated control-plane runtime — a step up from config files — with a documented plan to move to KMS.)
- **In the DB:** only `ciphertext + iv + auth_tag + wrapped_dek + version`. A DB dump alone is useless without the KMS.
- **UI:** secrets are **masked** (`sk-…last4`); decryption is an explicit, **logged** action (`secret.decrypt` in `platform_audit_log`); only the Owner role may reveal a full secret.
- **Rotation:** versioned; rotate re-encrypts under a new DEK and bumps `version`; old version retained until confirmed cutover.
- **Consumption by the tenant app (honest threat model — CP-6/CP-7):** VisibleAU's provider keys are needed at runtime to call the LLM APIs, so **they will live in the tenant runtime regardless** — the control plane does **not** remove that runtime exposure; its benefit is **lifecycle** (rotation, audit, single source of truth, ending config/plaintext sprawl). Two paths:
  1. **Env injection (default, and the path for all audit-critical provider keys):** the control plane is the **source of truth + inventory**; secrets sync into the tenant deployment's secret store at deploy/rotation. **Reliable and off the hot path — audits never depend on the control plane being reachable.**
  2. **Cached secure fetch (only for non-critical, rotatable integration secrets):** the tenant app fetches over **mTLS**, cached with TTL, **with graceful degradation** if the control plane is unreachable. Do **not** put audit-critical keys here — it would couple audit runs to control-plane availability (CP-7).
- **Migrate `ga4_api_secret`** out of plaintext tenant storage into this encrypted store (referenced, fetched on demand) — a concrete security improvement this LLD enables.
- **Master-key durability (CP-16):** the KMS master key must be **backed/escrowed** (KMS-native multi-region or key backup) — losing it makes **every** secret unrecoverable. Because the plaintext keys are re-enterable from provider dashboards, a total loss is recoverable by re-entry (not catastrophic), but the master key is never a single unbacked key. Control-plane DB backups are encrypted.
- **Master-key rotation (CP-20):** rotating the master key **re-wraps every secret's `wrapped_dek`** (envelope re-encryption) — no plaintext is re-exposed; versioned + logged. Distinct from per-secret rotation (which re-encrypts the value).

## 6. Config authoring & the publish bridge

The control plane **composes → validates → publishes**; the data plane consumes unchanged:
1. **Compose** — the admin app builds `resolved_config` **per `(market_code, locale, segment)` tuple** (CP-22: `config_bundle_cache`'s key; `segment ∈ {smb, agency, enterprise}`) from `platform_feature_availability` + `platform_markets` + `platform_settings`. Config that's identical across segments is authored once and **fanned out** to each segment bundle; per-segment overrides are supported where they differ.
2. **Validate** — reuse/extend the existing `config:validate` contract (required keys present, market coherent, no gated feature without a tier floor). Publishing a malformed config is blocked.
3. **Publish** — via **`ConfigBundleService.activate()`**, **merging into the current `resolved_config` (never replacing it wholesale — CP-25a) and computing `config_digest` with the tenant app's own digest function (CP-26)**, so the atomic **insert-new-active + deactivate-old** transaction (which preserves `config_bundle_one_active`) is owned by the tenant service, **supplying a new `bundle_version` (incremented)** (CP-1). Operator flag changes **UPSERT `org_feature_flags` `ON CONFLICT(organization_id, flag_key)`** (setting `set_by`, `reason`, `updated_at`) **and emit the tenant-side `feature_flag_changed` `audit_trail` event** (CP-4). Because `org_feature_flags` and `config_bundle_cache` writes touch RLS/transaction-owned tables, this runs with an **elevated service context** on the tenant side (CP-5). **All three writes execute in one tenant-DB transaction so a partial publish is impossible** (CP-13), and the publish **invalidates the tenant config cache** (e.g. `revalidateTag('config:<market>')`) so new config takes effect immediately (CP-11). **Concurrent publishes to the same (market, locale, segment) are serialized** — a `pg_advisory_xact_lock` around the publish (or retry-on-unique-violation) prevents a `bundle_version` race (CP-17). Recorded in `config_publications` (versioned). A **drift check** compares the live `config_bundle_cache.config_digest` to a recomputed digest of the `platform_*` source and alerts/re-publishes on mismatch (CP-21).
   - **Publish transport (use the internal API — it's the *correct* one, not just cleaner):**
     - **Internal authenticated API (recommended, CP-2/CP-8):** the tenant app exposes a protected `/api/internal/config/publish` (mTLS + service token, control-plane-only) that runs `ConfigBundleService.activate()` + the flag UPSERT + the audit event **inside the tenant app**, so the activate transaction, RLS context, and audit emission are all honoured. No cross-DB coupling.
     - **Direct restricted DB role (only if it replicates the full transaction):** writing `config_bundle_cache` directly is **unsafe unless** the control plane replicates activate()'s transaction (insert active + deactivate old + version + digest atomically), handles the RLS context on `org_feature_flags`, and emits the audit event. Couples the databases and re-implements tenant logic — **not recommended.**
4. **Rollback** — **re-activate the prior `bundle_version` row via `activate()`** (the one-active flip: set the old row `is_active=true`, deactivate the current — a pointer move, not a content mutation), invalidate the cache, and record it in `config_publications` (CP-14).

## 7. Feature enablement model (two levels)

Effective feature state = **platform availability AND org flag**:
- **Level 1 — platform availability (NEW, control plane):** is `feature_key` available in this `market_code` at all? (e.g., `abn_lookup` available only in `AU_EN`; `shopify_ads` only where enabled.) Published into `resolved_config.feature_availability`.
- **Level 2 — per-org flag (existing `org_feature_flags`):** has this org been toggled on/off by operators (betas, pilots, kill-switch)?

Tenant-app evaluation — a **real change to `lib/feature-flags/index.ts`** (which today resolves in priority **DB flags > env > defaults**), adding the Level-1 platform gate:
```
isFeatureEnabled(featureKey, org) =
   resolved_config.feature_availability[featureKey]?.is_available   // level 1 (NEW: from config_bundle_cache)
   && orgFlag(featureKey, org)                                       // level 2 (existing org_feature_flags)
   && tierSatisfies(subscriptions.tier, min_tier)                   // existing tier gate (subscriptions.tier)
```
The config **read path is unchanged** (`ConfigBundleService.resolve` already returns `resolved_config`); what changes is the **evaluation** — it gains the Level-1 check (CP-3). `platform_feature_availability.feature_key` **aligns with `org_feature_flags.flag_key`** where they overlap (`fan_out`, `linkedin_audit`, `youtube_audit`) so the two levels compose coherently. This adds the regional layer the founder described (ABN lookup / Shopify ads per region) without changing how config is *loaded*. **Absent-row default = closed** (`?.is_available` is falsy when no row exists) — safe, but it means **cutover must seed `is_available=true` for every currently-live feature or the Level-1 gate silently disables it** (CP-19, gated in §13).

## 8. The admin web app (separate Next.js app)

A standalone Next.js 16 (Turbopack) app, separate deploy, its own domain (e.g. `admin.internal.visibleau…`, not public), Better Auth for operators.

**Screens:**
- **Dashboard** — active markets, recent publications, pending changes, secret-rotation reminders, audit highlights.
- **Markets & Regions** — activate/deactivate markets, per-market settings/currency/fx; activating a market is the Phase-3 gate.
- **Feature Availability** — a matrix (features × markets) of on/off + per-feature config; the operator's "turn ABN lookup off for NZ" surface.
- **App Settings** — global `platform_settings` (maintenance mode, defaults).
- **Secrets** — list (masked), add/rotate, reveal (Owner-only, logged), consumption status.
- **Publish** — compose diff (what will change in the data plane), validate, publish, rollback; publication history.
- **Audit Log** — filterable, read-only, immutable.
- **Operators** — manage operator users/roles (Owner-only).

**UX/design:** reuse the FIX17 design language/tokens for consistency (Geist/Inter, the surface/elevation tokens) — **via a shared workspace package (tokens + a few primitives) consumed by both apps, or a documented lightweight token duplication** since the admin app is a *separate* Next.js app and can't import the tenant app's components directly (CP-23). Distinct operator chrome (clearly "Control Plane", not the customer app) to prevent confusion. Every mutating action shows a confirm + diff and writes to the audit log. Dark/light, accessible (this is a tool you'll live in).

## 9. Security model (this holds secrets — rigorous)

- **Network isolation:** control-plane app + DB are **not publicly reachable** — private network / VPN / IP allowlist. No route from the public internet or the tenant app's user surface.
- **Operator auth:** a **separate Better Auth instance** — its own `BETTER_AUTH_SECRET`, **host-only cookies** (never apex-scoped; ideally a separate apex domain) so tenant and operator sessions can never bleed across realms (CP-29); **MFA required**, short sessions, no self-signup (invite-only, Owner-provisioned).
- **RBAC (§10):** least privilege; secret decryption is Owner-only.
- **Encryption:** §5 (AES-256-GCM + KMS envelope; master key never in DB/config).
- **Immutable audit:** `platform_audit_log` is append-only — enforced at the **DB-grant level** (the application's DB role is granted INSERT/SELECT only, **no UPDATE/DELETE** on this table), not by app convention (CP-9). Every config change and **every secret access** is logged with actor/IP.
- **Least-privilege publish:** the data-plane write path (API token or DB role) can touch **only** `config_bundle_cache` + `org_feature_flags` — nothing else in the tenant DB. **Market-config source tables** (`provider_market_capabilities`, `sampling_policies`, `market_ai_budget_policies`, `metric_quality_gates`, `prompt_pack_coverage`) stay **tenant-migration-owned**; the control plane **triggers/coordinates** market activation rather than writing them directly, keeping this tight 2-table scope (CP-25b).
- **Harden the internal publish API (CP-18):** `/api/internal/config/publish` is a write path into *every* tenant's config — protect it with **signed requests** (align to the tenant app's `webhook_endpoints.signingSecret` convention) + a **rotating service token** + **IP allowlist** + **strict schema validation of the published payload** (reject unknown keys/malformed config) + rate limiting + per-call audit; refuse any caller that isn't the control plane.
- **No client access — ever:** there is no customer-facing route into the control plane; it's a separate app, DB, domain, and auth realm.
- **Disaster recovery (CP-16):** KMS master key backed/escrowed (never a single unbacked key); secrets re-enterable from provider dashboards as the ultimate fallback; a short DR runbook. The tenant app keeps running through a control-plane outage (config is already published; keys env-injected) — only the authoring source + secrets need DR.
- **Audit retention (CP-21):** `platform_audit_log` is archive-not-delete (cold-store old entries, preserving integrity); operator PII (actor/IP) handled per the **AU Privacy Act**.
- **Separate deployment & secrets:** the control plane's own infra secrets are separate from the tenant app's.
- **Backups:** control-plane DB backups are encrypted; secret ciphertext in backups is still KMS-protected.

## 10. Operator RBAC

| Role | Config (markets/features/settings) | Publish to data plane | Secrets: view masked | Secrets: reveal/rotate | Manage operators |
|---|---|---|---|---|---|
| **Owner** (Sri) | full | yes | yes | **yes** (logged) | yes |
| **Support** | view + limited edit (e.g. toggle a beta flag) | **no** (or with Owner approval) | yes (masked only) | **no** | no |
| **Auditor** (optional) | read-only | no | no | no | no |

Every role's actions are audited. Support can operate day-to-day config without ever touching secrets or the publish trigger unless granted.

## 11. Infrastructure & deployment

- **Three databases now:** tenant dev/mock, tenant prod/real, **control-plane** (new) — the multi-DB pattern already exists in ops, so this extends it.
- **Two apps:** the tenant app (public) and the control-plane admin app (private).
- **KMS/secrets manager** for the master key (or an injected env var in the isolated runtime as the documented interim).
- **Publish path** wired (internal API preferred).
- CI/deploy for the admin app separate from the tenant app.

## 12. Invariants & non-negotiables preserved

- **Tenant app config *read* unchanged** — still `ConfigBundleService.resolve()` + `org_feature_flags`, gaining only a `feature_availability` block inside the `resolved_config` it already loads. **But the feature-flag *evaluation* (`lib/feature-flags/index.ts`) does change** — it adds the Level-1 platform-availability gate (CP-3). Config loading is untouched; feature evaluation gains one check.
- **`serve()=25/25` untouched** — the control plane is a separate app; it adds no Inngest function to the tenant app.
- **Tier source stays `subscriptions.tier`** — platform `min_tier` is an availability floor, not a replacement; the downstream tier gate is unchanged.
- **RLS / brand isolation untouched** — no tenant-data changes; the control-plane DB holds no tenant data.
- **Managed-SaaS model intact** — secrets are VisibleAU's own; no BYOK introduced.
- **Better Auth** for operators (consistent with canon).
- Performance/Security/Scalability/UX are first-class (esp. security here).

## 13. Rollout

1. **Control-plane DB + admin app skeleton + Better Auth + RBAC + audit log** — the operator shell, no publish yet.
2. **Config authoring (read-only mirror)** — **import** the current `config_bundle_cache` + `org_feature_flags` into the `platform_*` source tables as the baseline (CP-15); surface markets, feature availability, settings; validate; no writes to the data plane yet.
3. **Publish bridge** — the internal, **environment-aware** publish API (targets the chosen tenant DB — dev/mock vs prod/real — CP-12); compose→validate→(one transaction: `ConfigBundleService.activate` + flag UPSERT + audit event)→cache invalidation; versioned `config_publications` + rollback.
4. **Cutover** — flip ownership: `config_bundle_cache` becomes control-plane-owned (tenant seed → **empty-table bootstrap only**, CP-10); manual flag edits stop. Tenant **tests** keep seeding config via fixtures, not the control plane (CP-12). **Gate cutover on a feature-availability completeness check** — every currently-live feature has an `is_available=true` row for the active market(s), or the closed-by-default Level-1 gate would disable it (CP-19).
5. **Feature-availability layer live** — tenant app evaluates Level-1 availability from published `resolved_config` (start AU-only, everything available = no behaviour change), then gate per-region.
6. **Secrets store** — encrypt provider/integration keys; migrate `ga4_api_secret` out of plaintext; wire consumption (env injection / cached fetch); KMS.
7. **Hardening** — network isolation, MFA, backups, penetration review before it holds production secrets.

## 14. Open questions

- OQ1. **Publish transport:** internal mTLS API (recommended, isolated) vs dedicated restricted DB role (simpler, coupled)?
- OQ2. **Secret consumption:** env-injection for all provider keys (simplest, reliable) vs cached runtime fetch for rotatable ones — which secrets need rotation-without-redeploy?
- OQ3. **KMS now or interim env-var master key?** (Cost/complexity vs security posture at current stage.)
- OQ4. **Default for Level-1 availability** on a new feature/market — closed (opt-in) or open? (Recommend closed/opt-in for safety.)
- OQ5. **Does the per-region feature layer supersede or complement** `provider_market_capabilities` (which already gates providers per market)? (Recommend: keep provider caps as-is; `platform_feature_availability` covers product features, not providers — document the boundary.)
- OQ6. **Support role scope** — how much can Support change without Owner approval?

---

*Draft for review. Grounded in v8.70 canon as written — `org_feature_flags` (operator-only, per-org, 8 keys), `config_bundle_cache`/`ConfigBundleService`, managed-SaaS/no-BYOK, `ga4_api_secret` plaintext, Better Auth, the region→market model. Confirm against built code before implementation. Security note: the master encryption key must live in a KMS/secrets manager (or, interim, an injected env var in the isolated control-plane runtime) — never in the control-plane database or any config file.*
